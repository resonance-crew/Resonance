// Sends a message as ${FROM} (a seeded account) to ${TO}, from outside the app — as another person's phone would:
// signs in at the Auth emulator with the seeded password, then POST /api/v1/messages with the ID token as a
// Bearer token (withUser, src/lib/api/v1/http.ts; App Check is only watched there, never required).
// Runs on the Mac (Maestro's runScript), so localhost is the runner's stack.
//
//   - runScript:
//       file: common/send-as.js
//       env:
//         FROM: bob
//         TO: alice
//         TEXT: 你在嗎 Maestro
//
// Reads AUTH_PORT, API_PORT and PASSWORD from the runner (`-e`). Sets output.sentId to the message's id.
var signIn = http.post(
  'http://localhost:' + AUTH_PORT + '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=emulator',
  {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: FROM + '@resonance.test', password: PASSWORD, returnSecureToken: true }),
  },
);
if (signIn.status !== 200) throw new Error('Auth emulator sign-in as ' + FROM + ': ' + signIn.status + ' ' + signIn.body);
var idToken = json(signIn.body).idToken;

var sent = http.post('http://localhost:' + API_PORT + '/api/v1/messages', {
  headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + idToken },
  body: JSON.stringify({ to: TO, text: TEXT }),
});
if (sent.status !== 201) throw new Error('POST /api/v1/messages as ' + FROM + ': ' + sent.status + ' ' + sent.body);
output.sentId = json(sent.body).id;
