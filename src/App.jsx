import ColleagueAIMarketplace from './ColleagueAIMarketplace.jsx';
import Demo from './Demo.jsx';

export default function App() {
  const path = window.location.pathname;
  if (path === '/demo' || path === '/demo/') return <Demo />;
  return <ColleagueAIMarketplace />;
}
