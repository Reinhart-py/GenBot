require("dotenv").config();
const { Telegraf } = require("telegraf");
const { message } = require("telegraf/filters");
const fs = require("fs");
const path = require("path");
const { checkGroup, errorLog } = require("./misc");
const { addMessageToQueue } = require("./messageQueue");
const { getContentResponse } = require("../gemini/generateContent");
const { clearChatHistory } = require("../gemini/generateChat");

// Define admin user IDs (replace these IDs with actual admin Telegram user IDs)
const ADMIN_USER_IDS = (process.env.ADMIN_ID);

const bot = new Telegraf(process.env.BOT_TOKEN);

/* ======= Bot actions ======= */
bot.start(async (ctx) => {
  console.log("Received /start command");
  try {
    if (!checkGroup(ctx)) return; // check if bot is allowed to reply in this group

    // clear chat history
    clearChatHistory(ctx.message?.chat?.id.toString());

    return ctx.reply(
      "Hi, this is *Gemini Bot BD*, ready to chat with you. \nReply to my message to start chatting...",
      {
        parse_mode: "Markdown",
        reply_to_message_id: ctx.message?.message_id,
        allow_sending_without_reply: true
      }
    );
  } catch (e) {
    errorLog(e);
    console.error("Error in start action:", e);
    return ctx.reply("Error occurred");
  }
});

bot.command("about", async (ctx) => {
  console.log("Received /about command");
  try {
    return ctx.reply(
      "I am Anya*\\. I am a Telegram bot developed by *Reinhart (kiri)* \\(@kiri\\0507\\) and maintained by *Kai* \\(@kiri0507\\)\\. I am here to chat with you\\.",
      {
        parse_mode: "MarkdownV2",
        allow_sending_without_reply: true
      }
    );
  } catch (e) {
    errorLog(e);
    console.error("error in about action:", e);
    return ctx.reply("Error occurred");
  }
});

bot.command("translate", async (ctx) => {
  console.log("Received /translate command");
  try {
    if (!checkGroup(ctx)) return; // check if bot is allowed to reply in this group

    // translation input text from reply to a message
    let text = ctx.message?.reply_to_message?.text;
    if (!text) {
      return ctx.reply("Reply to a message to translate it");
    }
    text = `translate to bn: "${text.trim()}"`;

    ctx.telegram.sendChatAction(ctx.message.chat.id, "typing");
    const res = await getContentResponse(text);
    if (!res) {
      return ctx.reply("🤐");
    }
    return ctx.reply(res, {
      parse_mode: "Markdown",
      reply_to_message_id: ctx.message.message_id,
      allow_sending_without_reply: true
    });
  } catch (e) {
    if (
      e?.response?.error_code === 400 &&
      e?.response?.description?.toLowerCase().includes("can't parse entities")
    ) {
      try {
        // if error is due to parsing entities, try sending message without markdown
        const res = e?.on?.payload?.text || "Error occurred!";
        return ctx.reply(res, {
          reply_to_message_id: ctx.message?.message_id,
          allow_sending_without_reply: true
        });
      } catch (e) {
        errorLog(e);
        return ctx.reply("Error occurred");
      }
    }
    errorLog(e);
  }
});

// =====================================================
// Admin-only /setprompt Command
// Allows designated admin users to set a custom prompt via Telegram.
// The prompt is saved to a file 'prompt.txt' in the current directory.
bot.command("setprompt", (ctx) => {
  const userId = ctx.from.id.toString();

  // Verify the user is an admin
  if (!ADMIN_USER_IDS.includes(userId)) {
    return ctx.reply("❌ You are not authorized to set the prompt.");
  }

  // Extract the prompt text from the message (after the command part)
  const promptText = ctx.message.text.replace('/setprompt', '').trim();
  if (!promptText) {
    return ctx.reply("⚠️ Please provide a prompt after the command.");
  }

  // Define the file path to store the custom prompt
  const promptFilePath = path.join(__dirname, "prompt.txt");

  // Write the prompt text to the file
  try {
    fs.writeFileSync(promptFilePath, promptText, "utf8");
    ctx.reply("✅ Prompt has been updated successfully.");
  } catch (error) {
    console.error("Error writing prompt:", error);
    ctx.reply("❌ An error occurred while updating the prompt.");
  }
});

// =====================================================
// Handling non-command text messages
// When generating a response, the bot reads the custom prompt (if set) 
// and prepends it to the user's message before calling the Gemini API.
bot.on("text", async (ctx) => {
  // Define the file path for the custom prompt
  const promptFilePath = path.join(__dirname, "prompt.txt");
  let customPrompt = "";

  // Read the prompt from file if it exists
  if (fs.existsSync(promptFilePath)) {
    customPrompt = fs.readFileSync(promptFilePath, "utf8");
  }

  const userMessage = ctx.message.text;
  const fullPrompt = customPrompt ? `${customPrompt}\n${userMessage}` : userMessage;

  // Call the Gemini API with the combined prompt.
  const responseText = await getContentResponse(fullPrompt);

  // Reply to the user with the response.
  ctx.reply(responseText, {
    parse_mode: "Markdown",
    reply_to_message_id: ctx.message.message_id,
    allow_sending_without_reply: true
  });
});

bot.catch((err) => {
  console.error("Bot encountered an error", err);
  errorLog(err);
});

bot.launch().then(() => {
  console.log("Telegram bot is running");
});
