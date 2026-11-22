import {
  applyCorsHeaders,
  getAiStatusSnapshot,
  sendJson,
  type VercelLikeRequest,
  type VercelLikeResponse,
} from '../_lib/aiCore';

export default function handler(req: VercelLikeRequest, res: VercelLikeResponse) {
  applyCorsHeaders(res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method && req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method Not Allowed' });
    return;
  }
  sendJson(res, 200, getAiStatusSnapshot());
}
