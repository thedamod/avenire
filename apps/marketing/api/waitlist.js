// Replaced by build:api. Keeping the entrypoint in Git lets Vercel discover the function.
export default {
  fetch() {
    return new Response("Waitlist is temporarily unavailable", { status: 503 });
  },
};
