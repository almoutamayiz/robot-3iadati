import {
  applyCorsHeaders,
  handleRobotTranscribe,
  readJsonBody,
  sendJson,
  type VercelLikeRequest,
  type VercelLikeResponse,
} from '../_lib/aiCore';

export default async function handler(req: VercelLikeRequest, res: VercelLikeResponse) {
  applyCorsHeaders(res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method Not Allowed' });
    return;
  }
  const body = await readJsonBody(req);
  const result = await handleRobotTranscribe(body);
  sendJson(res, result.status, result.payload);
}
