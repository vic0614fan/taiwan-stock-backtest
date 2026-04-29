export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const { body, apiKey } = req.body;

  async function callClaude(payload) {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    return response.json();
  }

  try {
    let payload = { ...body };
    let data = await callClaude(payload);

    // web_search 是 server tool，Anthropic 伺服器端自動執行搜尋
    // 但非串流模式下，Anthropic 會在第一次回應就包含完整結果
    // 若 stop_reason === "tool_use"（罕見），代表需要繼續多輪
    let maxRounds = 5;
    while (data.stop_reason === "tool_use" && maxRounds-- > 0) {
      const assistantContent = data.content;
      const toolUseBlocks = assistantContent.filter(
        (b) => b.type === "tool_use" || b.type === "server_tool_use"
      );
      if (toolUseBlocks.length === 0) break;

      const toolResults = toolUseBlocks.map((block) => ({
        type: "tool_result",
        tool_use_id: block.id,
        content: block.output || block.content || "",
      }));

      payload = {
        ...payload,
        messages: [
          ...(payload.messages || []),
          { role: "assistant", content: assistantContent },
          { role: "user", content: toolResults },
        ],
      };
      data = await callClaude(payload);
    }

    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
