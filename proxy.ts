import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Pages that need a logged-in user.
const PROTECTED = ["/dashboard", "/account", "/onboarding", "/faculty", "/admin"];

export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const path = request.nextUrl.pathname;
  const isProtected = PROTECTED.some((p) => path === p || path.startsWith(p + "/"));

  // Not configured yet: the public site still works, private pages go to login.
  if (!url || !key) {
    if (isProtected) return NextResponse.redirect(new URL("/login", request.url));
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // Refreshes the login session if it is about to expire. Keep this call.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const redirectTo = (to: string) => {
    const redirect = NextResponse.redirect(new URL(to, request.url));
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  };

  if (!user && isProtected) return redirectTo("/login");
  if (user && (path === "/login" || path === "/register")) return redirectTo("/dashboard");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
