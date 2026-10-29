import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChatbotExtractorService } from './chatbot-extractor';

vi.mock('../db', () => ({ getDb: vi.fn() }));

afterEach(() => vi.unstubAllGlobals());

describe('chatbot URL outbound boundaries', () => {
  it.each([
    'https://chatgpt.com.evil.example/share/abc',
    'https://chatgpt.com@evil.example/share/abc',
    'https://gemini.google.com.evil.example/share/abc',
    'https://claude.ai.evil.example/share/abc',
  ])('does not detect an attacker-controlled host: %s', text => {
    expect(new ChatbotExtractorService().detectUrls(text)).toEqual([]);
  });

  it('extracts an approved HTTPS share link from surrounding text', () => {
    expect(new ChatbotExtractorService().detectUrls('Read https://chatgpt.com/share/abc-123 now'))
      .toEqual([{ url: 'https://chatgpt.com/share/abc-123', platform: 'chatgpt' }]);
  });

  it('does not make an outbound request for a detected HTTP share link', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const extractor = new ChatbotExtractorService();
    const [detected] = extractor.detectUrls('http://chatgpt.com/share/abc');
    expect(detected).toBeDefined();
    const result = await extractor.extractConversation(detected.url, detected.platform);
    expect(result.success).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('never follows a redirect to an internal address', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, {
      status: 302, headers: { location: 'http://127.0.0.1/admin' },
    }));
    vi.stubGlobal('fetch', fetch);
    const result = await new ChatbotExtractorService()
      .extractConversation('https://chatgpt.com/share/abc', 'chatgpt');
    expect(result.success).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0].toString()).toBe('https://chatgpt.com/share/abc');
    expect(fetch.mock.calls[0][1]).toEqual(expect.objectContaining({ redirect: 'manual' }));
  });

  it('rejects a valid share URL when the requested platform does not match its host', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('<p>synthetic conversation</p>', { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    const result = await new ChatbotExtractorService()
      .extractConversation('https://claude.ai/share/abc', 'chatgpt');
    expect(result.success).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });
});
