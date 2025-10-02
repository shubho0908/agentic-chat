"use client";

import { useQuery } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import Image from "next/image";
import { Button } from "@/components/ui/button";

interface User {
  id: string;
  email: string;
  name?: string | null;
  image?: string | null;
  emailVerified: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export default function ChatPage() {
  const { data: sessionResponse, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['session'],
    queryFn: async () => {
      const response = await authClient.getSession();
      return response;
    },
    retry: 3,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  // Extract user from the session response
  const user = sessionResponse && typeof sessionResponse === 'object' && 'user' in sessionResponse ? 
    (sessionResponse as { user?: User }).user : null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg text-red-500">
          Error loading user data: {error?.message || 'Unknown error'}
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-lg mb-4">No user data found. Please log in or try again after authentication.</p>
          <Button
            onClick={() => refetch()}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 max-w-4xl">
      <h1 className="text-2xl font-bold mb-6">Chat Page</h1>
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold mb-4">User Information</h2>
        <div className="space-y-2">
          <p><strong>Name:</strong> {user?.name || "N/A"}</p>
          <p><strong>Email:</strong> {user?.email || "N/A"}</p>
          <p><strong>ID:</strong> {user?.id || "N/A"}</p>
          <p><strong>Image:</strong> {user?.image ? <Image src={user.image} alt="User" width={64} height={64} className="w-16 h-16 rounded-full mt-2" /> : "N/A"}</p>
          <p><strong>Email Verified:</strong> {user?.emailVerified ? "Yes" : "No"}</p>
        </div>
      </div>
    </div>
  );
}