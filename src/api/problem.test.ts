import { fallbackProblem, isProblem, parseProblem } from './problem';

function respond(body: string, contentType: string, status: number): Response {
  return new Response(body, { status, headers: { 'content-type': contentType } });
}

describe('parseProblem', () => {
  // U14
  it('U14 reads all fields of a problem+json body', async () => {
    const body = {
      type: 'https://example.com/forbidden',
      title: 'Forbidden',
      status: 403,
      code: 'forbidden',
      detail: 'No access.',
      instance: '/tickets/1',
      requestId: 'req-1',
      traceId: 'trace-1',
      errors: [{ field: '/name', code: 'required', message: 'Name is required.' }],
      missingScopes: ['tickets:write'],
    };
    const problem = await parseProblem(
      respond(JSON.stringify(body), 'application/problem+json', 403),
    );
    expect(problem).toEqual(body);
  });

  // U15
  it('U15 returns a general problem for an HTML body', async () => {
    const problem = await parseProblem(respond('<html>secret</html>', 'text/html', 502));
    expect(problem).toEqual({
      type: 'about:blank',
      title: 'Request failed',
      status: 502,
      code: 'request_failed',
    });
    expect(problem.detail).toBeUndefined();
  });

  // U16
  it('U16 does not throw for a JSON body that is not valid', async () => {
    const problem = await parseProblem(respond('{not json', 'application/problem+json', 500));
    expect(problem.title).toBe('Request failed');
    expect(problem.code).toBe('request_failed');
    expect(problem.status).toBe(500);
  });

  // U18
  it('U18 drops fields that have a wrong type', async () => {
    const body = {
      title: 'Bad',
      status: 400,
      detail: 12,
      errors: [
        { field: '/a', code: 'x', message: 'ok' },
        { field: '/b', code: 'x' },
      ],
    };
    const problem = await parseProblem(
      respond(JSON.stringify(body), 'application/problem+json', 400),
    );
    expect(problem.detail).toBeUndefined();
    expect(problem.errors).toEqual([{ field: '/a', code: 'x', message: 'ok' }]);
    expect(problem.code).toBe('request_failed');
    expect(problem.type).toBe('about:blank');
  });

  it('uses the HTTP status of the response', async () => {
    const body = { title: 'Nope', status: 200, code: 'nope' };
    const problem = await parseProblem(respond(JSON.stringify(body), 'application/json', 404));
    expect(problem.status).toBe(404);
  });

  it('returns a general problem for plain JSON without title and status', async () => {
    const problem = await parseProblem(respond('{"a":1}', 'application/json', 500));
    expect(problem).toEqual(fallbackProblem(500));
  });
});

describe('isProblem', () => {
  // U21
  it('U21 checks the shape', () => {
    expect(isProblem({ title: 't', status: 400, code: 'c' })).toBe(true);
    expect(isProblem(null)).toBe(false);
    expect(isProblem({ title: 't', status: 400 })).toBe(false);
  });
});
