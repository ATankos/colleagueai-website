import ColleagueAIMarketplace from './ColleagueAIMarketplace.jsx';
import Demo from './Demo.jsx';

export default function App() {
  // /demo and every localised variant (/de/demo, /cs/demo ...). Matching only the
  // exact "/demo" meant non-English visitors clicking "Book a demo" fell through
  // to the old marketplace view instead of the demo page.
  const path = window.location.pathname.replace(/\/+$/, '');
  if (/^(?:\/(?:cs|de|fr|es|it|pl|pt))?\/demo$/.test(path)) return <Demo />;
  return <ColleagueAIMarketplace />;
}
