import yts from "yt-search";

let handler = async (m, { conn, text, command, prefix }) => {
  if (!text) return conn.reply(m.chat, `*Contoh:* ${prefix + command} Lagu favorit`, m);
  
  // Simple cache system
  if (!global.audioCache) global.audioCache = new Map();
  const cacheKey = text.toLowerCase().trim();
  
  try {
    // 1️⃣ CEK CACHE DULU
    const cached = global.audioCache.get(cacheKey);
    if (cached) {
      await m.react("⚡");
      
      // PARALEL: Kirim info + audio dari cache
      await Promise.allSettled([
        conn.sendMessage(
          m.chat,
          {
            text: `⚡ *PLAY MUSIC* (Cached)\n\n` +
                  `🎵 *${cached.title}*\n` +
                  `👤 ${cached.channel}\n` +
                  `⏱️ ${cached.duration}`,
            contextInfo: {
              externalAdReply: {
                title: cached.title.slice(0, 60),
                body: cached.channel.slice(0, 30),
                thumbnailUrl: cached.cover,
                mediaType: 1,
                mediaUrl: cached.url,
                sourceUrl: cached.url,
                renderLargerThumbnail: true
              }
            }
          },
          { quoted: m }
        ),
        conn.sendMessage(
          m.chat,
          {
            audio: { url: cached.audio },
            mimetype: "audio/mpeg",
            fileName: cached.filename,
            ptt: false
          },
          { 
            quoted: m,
            upload: conn.waUploadToServer || undefined
          }
        )
      ]);
      
      await m.react("✅");
      return;
    }

    // 2️⃣ PROSES BARU
    await m.react("⏳");
    
    // Search YouTube
    const search = await yts(text);
    if (!search?.all?.length) {
      await m.react("❌");
      return conn.reply(m.chat, "Lagu tidak ditemukan!", m);
    }

    const video = search.all[0];
    let audioUrl = null;
    let metadata = null;
    
    // 3️⃣ COBA API UTAMA (ootaizumi)
    try {
      const apiRes = await fetch(`https://api.ootaizumi.web.id/downloader/youtube/play?query=${encodeURIComponent(video.url)}`, {
        signal: AbortSignal.timeout(4000) // Timeout 4 detik
      });
      
      if (apiRes.ok) {
        const apiData = await apiRes.json();
        
        if (apiData?.success && apiData.result?.downloadUrl) {
          audioUrl = apiData.result.downloadUrl;
          metadata = apiData.result.metadata || {
            title: video.title,
            channel: video.author?.name || "Unknown",
            duration: video.timestamp || video.duration || "N/A",
            url: video.url,
            cover: video.thumbnail || video.image
          };
        }
      }
    } catch (apiErr) {
      console.log("API ootaizumi gagal:", apiErr.message);
    }
    
    // 4️⃣ FALLBACK: API Nekolabs
    if (!audioUrl) {
      try {
        const fallbackRes = await fetch(`https://api.nekolabs.web.id/downloader/youtube/play/v1?q=${encodeURIComponent(video.url)}`, {
          signal: AbortSignal.timeout(4000) // Timeout 4 detik
        });
        
        if (fallbackRes.ok) {
          const fallbackData = await fallbackRes.json();
          
          if (fallbackData?.success && fallbackData.result?.downloadUrl) {
            audioUrl = fallbackData.result.downloadUrl;
            metadata = fallbackData.result.metadata || {
              title: video.title,
              channel: video.author?.name || "Unknown",
              duration: video.timestamp || video.duration || "N/A",
              url: video.url,
              cover: video.thumbnail || video.image
            };
          }
        }
      } catch (fallbackErr) {
        console.log("API nekolabs gagal:", fallbackErr.message);
      }
    }
    
    // 5️⃣ FALLBACK EXTREME: Direct YouTube URL
    if (!audioUrl) {
      // Last resort - generate direct URL pattern
      audioUrl = `https://www.youtube.com/watch?v=${video.videoId}`;
      metadata = {
        title: video.title,
        channel: video.author?.name || "Unknown",
        duration: video.timestamp || video.duration || "N/A",
        url: video.url,
        cover: video.thumbnail || video.image
      };
    }
    
    // 6️⃣ SIMPAN KE CACHE
    const cacheData = {
      audio: audioUrl,
      title: metadata.title,
      channel: metadata.channel,
      duration: metadata.duration,
      url: metadata.url,
      cover: metadata.cover,
      filename: `${metadata.title.replace(/[^\w\s]/gi, '').slice(0, 40)}.mp3`
    };
    
    global.audioCache.set(cacheKey, cacheData);
    // Auto delete cache setelah 15 menit
    setTimeout(() => global.audioCache.delete(cacheKey), 15 * 60 * 1000);

    // 7️⃣ KIRIM PARALEL
    await Promise.allSettled([
      // Kirim info
      conn.sendMessage(
        m.chat,
        {
          text: `🎧 *PLAY MUSIC*${!audioUrl.includes('youtube.com/watch') ? '' : ' (Direct Link)'}\n\n` +
                `🎵 *${metadata.title}*\n` +
                `👤 ${metadata.channel}\n` +
                `⏱️ ${metadata.duration}`,
          contextInfo: {
            externalAdReply: {
              title: metadata.title.slice(0, 60),
              body: metadata.channel.slice(0, 30),
              thumbnailUrl: metadata.cover,
              mediaType: 1,
              mediaUrl: metadata.url,
              sourceUrl: metadata.url,
              renderLargerThumbnail: true
            }
          }
        },
        { quoted: m }
      ),
      
      // Kirim audio
      conn.sendMessage(
        m.chat,
        {
          audio: { url: audioUrl },
          mimetype: "audio/mpeg",
          fileName: cacheData.filename,
          ptt: false
        },
        { 
          quoted: m,
          upload: conn.waUploadToServer || undefined,
          mediaUploadTimeoutMs: 25000
        }
      )
    ]);

    await m.react("✅");

  } catch (err) {
    console.error("Play Error:", err);
    
    await m.react("❌");
    
    if (err.message?.includes("timeout") || err.code === "ETIMEDOUT") {
      return conn.reply(m.chat, "⏱️ Timeout! Server sibuk, coba lagi.", m);
    }
    
    return conn.reply(m.chat, "❌ Gagal memproses audio. Coba lagu lain.", m);
  }
};

// Command config
handler.help = ["play <judul>"];
handler.tags = ["downloader"];
handler.command = /^(play|yt|ytplay|song|music)$/i;
handler.limit = true;

export default handler;
