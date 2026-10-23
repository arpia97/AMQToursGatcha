// Keep the economy and its Durable Object in the original Worker.
// The shorter public address forwards requests through a private service binding.
export default {
  fetch(request, env) {
    return env.GAME_SITE.fetch(request);
  },
};
