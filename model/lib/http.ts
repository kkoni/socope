export const userAgent = 'soccet/0.1';

const http = { get };
export default http;

function get(url: string, headers?: any, params?: any): Promise<Response> {
  return fetch(url + (params === undefined ? '' : '?' + new URLSearchParams(params)), {
    method: 'GET',
    headers: {
      ...(headers || {}),
      'User-Agent': userAgent,
    },
  });
}
