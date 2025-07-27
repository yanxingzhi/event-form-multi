// functions/check.ts

export async function onRequestGet({ request, env }) {
    try {
      const { searchParams } = new URL(request.url)
      const a = searchParams.get("a")
      const e = searchParams.get("e")
  
      if (!a || !e) {
        return new Response(JSON.stringify({ success: false, error: "缺少查询参数 a 或 e" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        })
      }
  
      // 1. 构造 JWT
      const jwtHeader = { alg: "RS256", typ: "JWT" }
      const now = Math.floor(Date.now() / 1000)
      const jwtClaimSet = {
        iss: env.GOOGLE_CLIENT_EMAIL,
        scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
        aud: "https://oauth2.googleapis.com/token",
        exp: now + 3600,
        iat: now,
      }
  
      const toBase64Url = (str: string) =>
        btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
  
      const encoder = new TextEncoder()
      const headerBase64 = toBase64Url(JSON.stringify(jwtHeader))
      const claimBase64 = toBase64Url(JSON.stringify(jwtClaimSet))
      const toSign = `${headerBase64}.${claimBase64}`
  
      const privateKeyPEM = env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n")
      const privateKey = await crypto.subtle.importKey(
        "pkcs8",
        pemToArrayBuffer(privateKeyPEM),
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["sign"]
      )
  
      const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, encoder.encode(toSign))
      const signedJWT = `${toSign}.${toBase64Url(String.fromCharCode(...new Uint8Array(signature)))}`
  
      // 2. 获取 access token
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
          assertion: signedJWT,
        }),
      })
  
      const tokenJson = await tokenRes.json()
      const accessToken = tokenJson.access_token
  
      // 3. 从 Google Sheets 读取数据
      const readRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${env.SHEET_ID}/values/A:E`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      )
  
      const readJson = await readRes.json()
      const rows = readJson.values || []
  
      // 4. 查找符合条件的数据
      const found = rows.find((row) => row[0] === a && row[4] === e)
  
      return new Response(
        JSON.stringify({
          success: true,
          found: !!found,
          row: found || null,
        }),
        {
          headers: { "Content-Type": "application/json" },
        }
      )
    } catch (error) {
      return new Response(JSON.stringify({ success: false, error: error.message || "未知错误" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      })
    }
  }
  
  function pemToArrayBuffer(pem: string): ArrayBuffer {
    const b64 = pem
      .replace(/-----BEGIN PRIVATE KEY-----/, "")
      .replace(/-----END PRIVATE KEY-----/, "")
      .replace(/\n/g, "")
    const binary = atob(b64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    return bytes.buffer
  }
  