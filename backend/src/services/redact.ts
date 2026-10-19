//Strips contact details from resume text before it goes to the AI.
//The match doesn't need them, and it keeps less personal data leaving our server.
//Names can't be removed reliably this way; the prompt tells the AI to ignore them instead.

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const URL = /\b(?:https?:\/\/|www\.)\S+|\b(?:linkedin\.com|github\.com)\/\S*/gi;
//phone numbers like (555) 123-4567, 555.123.4567, +1 555 123 4567
const PHONE = /(?:\+\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g;

export function redactContactInfo(text: string): string {
  return text
    .replace(EMAIL, "[email]")
    .replace(URL, "[link]")
    .replace(PHONE, "[phone]");
}
