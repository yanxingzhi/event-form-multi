// functions/submit.ts

export async function onRequestPost({ request, env }) {
    try {
    const data = await request.json()
    const { name, phone, email, message, activityId } = data
    const jwtHeader = {
      alg: "RS256",
      typ: "JWT"
    }
  
    const now = Math.floor(Date.now() / 1000)
    const jwtClaimSet = {
      iss: env.GOOGLE_CLIENT_EMAIL,
      scope: "https://www.googleapis.com/auth/spreadsheets",
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now
    }
  
    const toBase64Url = (str: string) =>
      btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
  
    const encoder = new TextEncoder()
    const headerBase64 = toBase64Url(JSON.stringify(jwtHeader))
    const claimBase64 = toBase64Url(JSON.stringify(jwtClaimSet))
    const toSign = `${headerBase64}.${claimBase64}`
  
    const privateKey = await crypto.subtle.importKey(
      "pkcs8",
      pemToArrayBuffer(env.GOOGLE_PRIVATE_KEY),
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"]
    )
  
    const signature = await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      privateKey,
      encoder.encode(toSign)
    )
  
    const signedJWT = `${toSign}.${toBase64Url(String.fromCharCode(...new Uint8Array(signature)))}`
  
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: signedJWT
      })
    })
  
    const tokenJson = await tokenRes.json()
    const accessToken = tokenJson.access_token
  
    const sheetRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${env.SHEET_ID}/values/A:E:append?valueInputOption=RAW`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          values: [[activityId, name, phone, email, message]]
        })
      }
    )
  
    if (sheetRes.ok) {
      return new Response("OK")
    } else {
      const errorText = await sheetRes.text()
      return new Response(`Error writing to sheet: ${errorText}`, { status: 500 })
    }
} catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message || "Unknown error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
  }
  
  function pemToArrayBuffer(pem: string): ArrayBuffer {
    const b64 = pem
      .replace(/-----BEGIN PRIVATE KEY-----/, "")
      .replace(/-----END PRIVATE KEY-----/, "")
      .replace(/\n/g, "")
    const binary = b64
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    return bytes.buffer
  }