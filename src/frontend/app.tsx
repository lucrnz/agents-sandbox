import { Route, Switch } from "wouter";
import { lazy } from "react";
import { GlobalLayout } from "./global-layout";
import { Toaster } from "@/frontend/components/ui/sonner";

const HomePage = lazy(() => import("@/frontend/pages/home/home-page"));
const ChatPage = lazy(() => import("@/frontend/pages/chat/chat-page"));
const TodoAppPage = lazy(() => import("@/frontend/sandbox/todo-app/TodoApp"));
const NotFoundPage = lazy(() => import("@/frontend/pages/not-found/not-found-page"));

function Providers({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Toaster />
    </>
  );
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
