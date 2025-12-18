import { Link } from "wouter";
import { Button } from "@/frontend/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/frontend/components/ui/card";

export default function HomePage() {
  return (
    <div className="bg-background min-h-screen p-8">
      <header className="mb-8">
        <h1 className="text-foreground text-4xl font-bold">AI Command Center</h1>
        <p className="text-muted-foreground mt-2">Welcome to the AI sandbox environment</p>
      </header>

      <main className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card className="transition-shadow hover:shadow-md">
          <CardHeader>
            <CardTitle>AI Chatbot</CardTitle>
            <CardDescription>Interact with AI models via WebSocket</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4 text-sm">Real-time conversation with Grok</p>
            <Link href="/chat">
              <Button className="w-full">Launch Chatbot</Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="transition-shadow hover:shadow-md">
          <CardHeader>
            <CardTitle>Todo App</CardTitle>
            <CardDescription>Sandbox application</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4 text-sm">Example application for testing</p>
            <Link href="/sandbox/todo-app">
              <Button className="w-full" variant="secondary">
                Todo App
              </Button>
            </Link>
          </CardContent>
        </Card>
      </main>

      <footer className="border-border mt-12 border-t pt-8">
        <p className="text-muted-foreground text-sm">
          AI Command Center - WebSocket-based AI Sandbox
        </p>
      </footer>
    </div>
  );
}
