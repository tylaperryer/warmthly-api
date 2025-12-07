/**
 * Dynamic Open Graph Image Generator
 * Generates OG images on-demand from site content
 * 
 * Usage: /og-image?title=Page Title&description=Description&app=main
 */

interface Env {
  // No env vars needed for basic version
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Truncate text to fit in OG image
 */
function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

/**
 * Generate dynamic OG image as SVG
 */
function generateOGImageSVG(
  title: string,
  description: string,
  app: string,
  type?: string
): string {
  // Warmthly brand colors
  const orange = '#FF8C42';
  const background = '#fff6f1';
  const backgroundAlt = '#ffeee6';
  const textColor = '#1a1a1a';
  
  // App-specific styling
  const appColors: Record<string, { primary: string; gradient: string }> = {
    main: { primary: orange, gradient: 'rgba(255, 140, 66, 0.15)' },
    mint: { primary: '#4CAF50', gradient: 'rgba(76, 175, 80, 0.15)' },
    post: { primary: '#2196F3', gradient: 'rgba(33, 150, 243, 0.15)' },
    admin: { primary: '#9C27B0', gradient: 'rgba(156, 39, 176, 0.15)' },
  };
  
  const colors = appColors[app] || appColors.main;
  
  // Truncate text for display
  const displayTitle = truncateText(title, 60);
  const displayDesc = truncateText(description, 120);
  
  // Escape HTML
  const safeTitle = escapeHtml(displayTitle);
  const safeDesc = escapeHtml(displayDesc);
  
  // Split title into lines if needed (rough estimate: ~30 chars per line at 64px font)
  const titleLines: string[] = [];
  const words = displayTitle.split(' ');
  let currentLine = '';
  
  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (testLine.length <= 30) {
      currentLine = testLine;
    } else {
      if (currentLine) titleLines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) titleLines.push(currentLine);
  
  // Generate SVG
  const svg = `
    <svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:${background};stop-opacity:1" />
          <stop offset="100%" style="stop-color:${backgroundAlt};stop-opacity:1" />
        </linearGradient>
        <radialGradient id="grad1" cx="80%" cy="20%">
          <stop offset="0%" style="stop-color:${colors.gradient};stop-opacity:1" />
          <stop offset="100%" style="stop-color:rgba(255,140,66,0);stop-opacity:1" />
        </radialGradient>
        <radialGradient id="grad2" cx="10%" cy="90%">
          <stop offset="0%" style="stop-color:rgba(255,182,193,0.12);stop-opacity:1" />
          <stop offset="100%" style="stop-color:rgba(255,182,193,0);stop-opacity:1" />
        </radialGradient>
      </defs>
      
      <!-- Background -->
      <rect width="1200" height="630" fill="url(#bg)"/>
      <circle cx="1000" cy="100" r="300" fill="url(#grad1)"/>
      <circle cx="100" cy="550" r="350" fill="url(#grad2)"/>
      
      <!-- Logo -->
      <rect x="80" y="80" width="60" height="60" rx="12" fill="${colors.primary}"/>
      <text x="110" y="125" font-family="Arial, sans-serif" font-size="36" font-weight="bold" fill="white" text-anchor="middle">W</text>
      <text x="155" y="120" font-family="Georgia, serif" font-size="36" font-weight="700" fill="${colors.primary}">Warmthly</text>
      
      <!-- Title (multi-line support) -->
      <text x="80" y="220" font-family="Arial, sans-serif" font-size="64" font-weight="700" fill="${textColor}">
        ${titleLines.map((line, index) => 
          `<tspan x="80" dy="${index === 0 ? '0' : '75'}">${escapeHtml(line)}</tspan>`
        ).join('')}
      </text>
      
      <!-- Description -->
      <text x="80" y="${220 + (titleLines.length * 75) + 40}" font-family="Arial, sans-serif" font-size="28" fill="${textColor}" opacity="0.8">
        <tspan x="80" dy="0">${safeDesc}</tspan>
      </text>
      
      <!-- Accent line -->
      <rect x="80" y="550" width="120" height="6" rx="3" fill="${colors.primary}"/>
    </svg>
  `.trim();
  
  return svg;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request } = context;
  const url = new URL(request.url);
  
  // Get parameters from URL
  const title = url.searchParams.get('title') || 'Warmthly';
  const description = url.searchParams.get('description') || 'Rehumanize our world - making empathy a measurable part of our systems';
  const app = url.searchParams.get('app') || 'main';
  const type = url.searchParams.get('type') || '';
  
  try {
    // Generate SVG
    const svg = generateOGImageSVG(
      decodeURIComponent(title),
      decodeURIComponent(description),
      app,
      type
    );
    
    // Return as SVG (works for Twitter, LinkedIn, Facebook, etc.)
    return new Response(svg, {
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=3600, s-maxage=3600', // Cache for 1 hour
        'X-Content-Type-Options': 'nosniff',
      },
    });
    
  } catch (error) {
    console.error('Error generating OG image:', error);
    // Return a simple fallback image
    const fallbackSvg = generateOGImageSVG('Warmthly', 'Rehumanize our world', 'main');
    return new Response(fallbackSvg, {
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=300', // Cache fallback for 5 minutes
      },
    });
  }
};

