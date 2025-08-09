// functions/submit.ts

export async function onRequestPost({ request, env }) {
    try {
    const {
      name,
      sex,
      nationality,
      phone,
      email,
      school,
      message,
      activityId,
      userId
    } = await request.json();
    if (!activityId || !name || !sex || !nationality || !phone || !email) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400 });
    }

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
  
    const privateKeyPEM = env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n");
    const privateKey = await crypto.subtle.importKey(
      "pkcs8",
      pemToArrayBuffer(privateKeyPEM),
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
          values: [[activityId, userId, 
            name,
            sex,
            nationality,
            phone,
            email,
            school,
            message,]]
        })
      }
    )
  
    if (sheetRes.ok) {
      const events = await fetch("https://event-form-multi.pages.dev/data/events.json")
      const eventsJson = await events.json()
      await sendToLine({userId, text: `｢${eventsJson.find(e => e.id == activityId).title}」：すでに申し込みを済ませております、ありがとうございました`})
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
    const binary = atob(b64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    return bytes.buffer
  }

  async function sendToLine({userId, text}) {
    const LINE_CHANNEL_ACCESS_TOKEN = "RSrukCgPiNBsVcRUBAKraUn/2g8sY9csIuNSnNGKtQ6DBk4kPnaulYvJaUoNiMaxY92sbWi3Nf0fLh8EO82wfsdzGSOTL+OTgO/p/hrLGSgw0KSzoKVqLLlgflBBCmheWme6SHkj01fsEfDSQj/QJgdB04t89/1O/w1cDnyilFU=";
    const TARGET_USER_ID = userId;
    const response = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`
      },
      body: JSON.stringify({
        to: TARGET_USER_ID,
        messages: [
          {
            type: "text",
            text: text
          }
        ]
      })
    });
  
    if (!response.ok) {
      const errorText = await response.text();
      console.error("发送消息失败:", errorText);
    }
  
    console.log("消息发送成功");
  }