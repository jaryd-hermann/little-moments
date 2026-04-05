import { getDayOfYear } from "date-fns";

export const DAILY_QUESTIONS = [
  "What's one little moment from the last few days you'd want to remember?",
  "What made you smile recently — even just for a second?",
  "What's something small that happened today you'd mention at dinner?",
  "Who crossed your mind today, and why?",
  "What's something you noticed today that you normally wouldn't?",
  "What's the last thing that made you laugh out loud?",
  "What's a conversation you had recently that stuck with you?",
  "What felt different about today compared to yesterday?",
  "What's something you saw today that caught your eye?",
  "What's the most ordinary thing that happened today — and what was it really about?",
  "What's something someone you love said recently that you don't want to forget?",
  "What's the last thing you ate that you actually tasted?",
  "What did the weather feel like on your face today?",
  "What's a sound you heard today that you don't usually notice?",
  "What moment today would you tell your best friend about?",
  "What's something that annoyed you today — and why did it matter?",
  "What's a decision you made today that felt small but wasn't?",
  "What's the last photo on your phone, and what was happening?",
  "What's something you're looking forward to, even just a little?",
  "What did you do today that felt like it was just for you?",
  "What's a place you were today — what did it look like?",
  "What's something you did on autopilot today that deserves a second look?",
  "What's the last kind thing someone did for you?",
  "What's something you learned today, even if it was tiny?",
  "What's a moment today when time felt like it slowed down?",
  "What's the last thing you cooked, and who was there?",
  "What's a habit or routine you did today — what does it mean to you?",
  "What's a texture you touched today — a fabric, a surface, something in your hands?",
  "What's the first thing you thought about when you woke up today?",
  "What's the last thing you said to someone today, and what did it really mean?",
  "What's something you almost forgot to do today?",
  "What's a moment when you felt fully present today?",
  "What's the best part of your commute or walk today?",
  "What's something that surprised you today?",
  "What's a tiny victory you had today?",
  "What's something you wish you could tell your past self about today?",
  "What did your morning look like, in detail?",
  "What's something you're grateful for today that you usually take for granted?",
  "What's the most beautiful thing you saw today?",
  "What's a moment today that felt completely yours?",
];

export function getDailyQuestion(): string {
  const dayIndex = getDayOfYear(new Date()) - 1;
  return DAILY_QUESTIONS[dayIndex % DAILY_QUESTIONS.length];
}
