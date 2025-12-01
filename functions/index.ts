// functions/index.ts

export const onRequest: PagesFunction = async ({ request }) => {
  // Option A: Return a 404 Not Found (Standard for an unhandled root API)
  return new Response("Not Found", { status: 404 });

  // Option B: Return a 204 No Content (If you want a successful, but empty, response)
  // return new Response(null, { status: 204 });

  // Option C: Return a helpful API root message (e.g., "Use /api/...")
  // return new Response(
  //   JSON.stringify({
  //     status: "API Root",
  //     message: "Access the API endpoints under /api/",
  //   }),
  //   {
  //     headers: { "Content-Type": "application/json" },
  //     status: 200,
  //   }
  // );
};
