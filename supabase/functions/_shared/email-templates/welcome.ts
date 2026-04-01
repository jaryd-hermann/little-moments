import { emailLayout, ctaButton } from "./layout.ts";

export function welcomeEmail(name?: string): { subject: string; html: string } {
  const greeting = name ? `Hi ${name},` : "Hi there,";
  return {
    subject: "Welcome to Little Moments",
    html: emailLayout({
      preheader: "Your account is ready. Start capturing moments today.",
      body: `
        <p style="margin:0 0 16px;">${greeting}</p>
        <p style="margin:0 0 16px;">
          Thanks for joining Little Moments. The app is designed to help you
          notice and hold onto the small things that make your days meaningful.
        </p>
        <p style="margin:0 0 16px;">
          You have a 14-day free trial to explore everything. No commitment,
          no pressure -- just write when something stands out.
        </p>
        ${ctaButton("Open Little Moments")}
        <p style="margin:0;color:rgba(0,0,0,0.6);font-size:14px;">
          We will send a few short emails over the next week to help you get
          the most out of the app. That is all.
        </p>
      `,
    }),
  };
}
