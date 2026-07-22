import { ImageResponse } from 'next/og'
import { siteConfig } from '@/lib/site'

export const alt = `${siteConfig.name} — ${siteConfig.tagline}`
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 80,
          backgroundColor: '#16181d',
          color: '#f5f6f8',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 2 3 6.5v11L12 22l9-4.5v-11L12 2Z"
              stroke="#5ee08c"
              strokeWidth="1.6"
              strokeLinejoin="round"
              opacity="0.45"
            />
            <path
              d="m8 9.5 3.5 2.5L8 14.5M13 15h3"
              stroke="#5ee08c"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <div style={{ fontSize: 36, fontWeight: 600 }}>{siteConfig.name}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ fontSize: 64, fontWeight: 700, lineHeight: 1.1, maxWidth: 950 }}>
            The API-first platform for building learning systems
          </div>
          <div style={{ fontSize: 28, color: '#9aa0ab', maxWidth: 900 }}>
            Open-source headless LMS in modern TypeScript — typed SDK, composable
            adapters, MCP endpoint.
          </div>
        </div>
        <div style={{ display: 'flex', fontSize: 24, color: '#5ee08c' }}>
          headless-lms.dev
        </div>
      </div>
    ),
    size,
  )
}
