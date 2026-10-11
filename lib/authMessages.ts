// Turns the login service's blunt messages into something a person can act on.
// Unknown messages are shown as they are, so nothing is hidden.
export function friendlyAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "That email and password don't match. Check both and try again.";
  if (m.includes("email not confirmed")) return "Please confirm your email first: open the link we sent you, then log in.";
  if (m.includes("signups not allowed") || m.includes("signup is disabled") || m.includes("signups are disabled")) {
    return "New accounts are turned off for this site. Ask the owner to create one for you.";
  }
  if (m.includes("already registered") || m.includes("already been registered")) {
    return "There's already an account with that email. Try logging in instead.";
  }
  if (m.includes("password should be at least") || m.includes("password is too short") || m.includes("weak password")) {
    return "That password is too weak. Use at least 8 characters, and avoid common words.";
  }
  if (m.includes("rate limit") || m.includes("too many requests")) return "Too many attempts. Please wait a few minutes and try again.";
  if (m.includes("failed to fetch") || m.includes("network")) return "Couldn't reach the server. Check your connection and try again.";
  return message;
}
