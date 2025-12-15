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
    <div className="min-h-screen bg-gray-50 p-8">
      <header className="mb-8">
        <h1 className="text-4xl font-bold text-gray-800">AI Command Center</h1>
        <p className="text-gray-600 mt-2">
          Welcome to the AI sandbox environment
        </p>
      </header>

      <main className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader>
            <CardTitle>AI Chatbot</CardTitle>
            <CardDescription>
              Interact with AI models via WebSocket
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600 mb-4">
              Real-time conversation with Grok
            </p>
            <Link href="/chat">
              <Button className="w-full">Launch Chatbot</Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader>
            <CardTitle>Todo App</CardTitle>
            <CardDescription>Sandbox application</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600 mb-4">
              Example application for testing
            </p>
            <Link href="/sandbox/todo-app">
              <Button className="w-full" variant="secondary">
                Todo App
              </Button>
            </Link>
          </CardContent>
        </Card>
      </main>

      <footer className="mt-12 pt-8 border-t border-gray-200">
        <p className="text-sm text-gray-500">
          AI Command Center - WebSocket-based AI Sandbox
        </p>
      </footer>
    </div>
  );
}
