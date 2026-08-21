import Demo from './Demo.jsx';

// The SPA bundle is served at exactly eight URLs — /demo and its seven locale
// variants — so Demo is the whole application. There used to be a second branch
// here rendering a marketplace view for any other path, but vercel.json never
// routed anything else to this bundle, so that branch was unreachable and the
// component behind it was 47 KB of dead code. src/App.test.jsx pins the routes
// this must serve; if the rewrites ever widen, those tests are where it shows.
export default function App() {
  return <Demo />;
}
