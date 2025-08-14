"use client"

import PrimaryButton from "./primary-button"
import { useRouter } from "next/navigation"

export default function LoginButton() {
  const router = useRouter()
  return <PrimaryButton onClick={() => router.push("/login")}>Sign in</PrimaryButton>
}

