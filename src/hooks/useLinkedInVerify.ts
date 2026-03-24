import { useCallback, useRef } from "react";
import { Auth0Client } from "@auth0/auth0-spa-js";

const AUTH0_DOMAIN = "dev-msjn4qzod183r8ry.us.auth0.com";
const AUTH0_CLIENT_ID = "QkVIpO3bCsU8cDoodjk7zAlPV0F-15vYdxk89D-tbhKM8NWJey2PNmDtPaJxrIAV";

export interface LinkedInProfile {
  full_name: string | null;
  title: string | null;
  bio: string | null;
  location: string | null;
  avatar_url: string | null;
  email: string | null;
}

/**
 * Hook that uses Auth0 as a LinkedIn-only verification layer.
 * Opens a popup for LinkedIn OAuth, returns profile data.
 * Does NOT affect the main Supabase Auth session.
 */
export function useLinkedInVerify() {
  const clientRef = useRef<Auth0Client | null>(null);

  const getClient = useCallback(async () => {
    if (!clientRef.current) {
      clientRef.current = new Auth0Client({
        domain: AUTH0_DOMAIN,
        clientId: AUTH0_CLIENT_ID,
        authorizationParams: {
          redirect_uri: window.location.origin,
          connection: "linkedin",
          scope: "openid profile email",
        },
        cacheLocation: "memory", // Don't persist — this is verification only
      });
    }
    return clientRef.current;
  }, []);

  const verify = useCallback(async (): Promise<LinkedInProfile> => {
    const client = await getClient();

    // Open Auth0 popup for LinkedIn
    await client.loginWithPopup({
      authorizationParams: {
        connection: "linkedin",
        scope: "openid profile email",
      },
    });

    // Get the user info from Auth0
    const user = await client.getUser();

    if (!user) {
      throw new Error("No profile data returned from LinkedIn");
    }

    // Map Auth0 user info to our profile shape
    const profile: LinkedInProfile = {
      full_name: user.name || user.nickname || null,
      title: null, // Auth0 LinkedIn doesn't expose headline by default
      bio: null,
      location: null,
      avatar_url: user.picture || null,
      email: user.email || null,
    };

    // Clean up — log out of Auth0 (doesn't affect Supabase session)
    try {
      await client.logout({ openUrl: false });
    } catch {
      // Ignore logout errors
    }
    clientRef.current = null;

    return profile;
  }, [getClient]);

  return { verify };
}
