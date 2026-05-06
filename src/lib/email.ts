import { Resend } from "resend";

interface SendArgs {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

// Sends via Resend if RESEND_API_KEY is set; otherwise logs the message to
// the server console. The approval flow prints the approve/reject URLs
// explicitly so you can still test locally without email config.
export async function sendEmail(args: SendArgs): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.FROM_EMAIL ?? "onboarding@resend.dev";

  if (!apiKey) {
    console.log("\n[email:stub] ---------- would send ----------");
    console.log(`To:      ${args.to}`);
    console.log(`Subject: ${args.subject}`);
    console.log(args.text ?? args.html.replace(/<[^>]+>/g, ""));
    console.log("[email:stub] ----------------------------------\n");
    return;
  }

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from,
    to: args.to,
    subject: args.subject,
    html: args.html,
    text: args.text,
  });
  if (error) {
    console.error("[email] send failed:", error);
    throw new Error("Failed to send email");
  }
}
