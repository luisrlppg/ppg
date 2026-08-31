"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function CatalogosRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/productos");
  }, [router]);

  return null;
}