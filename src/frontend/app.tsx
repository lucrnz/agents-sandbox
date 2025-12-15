import { Route, Switch } from "wouter";
import { lazy } from "react";
import { GlobalLayout } from "./global-layout";

const HomePage = lazy(() => import("./pages/home/home-page"));
const ChatPage = lazy(() => import("./pages/chat/chat-page"));
const TodoAppPage = lazy(() => import("./sandbox/todo-app/TodoApp"));
const NotFoundPage = lazy(() => import("./pages/not-found/not-found-page"));

function Providers({ children }: { children: React.ReactNode }) {
  // Reservered for future providers
  return <>{children}</>;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={HomePage} />
      <Route path="/chat" component={ChatPage} />
      <Route path="/sandbox/todo-app" component={TodoAppPage} />
      <Route path="*" component={NotFoundPage} />
    </Switch>
  );
}

export default function App() {
  return (
    <Providers>
      <GlobalLayout>
        <Router />
      </GlobalLayout>
    </Providers>
  );
}
