import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/frontend/components/ui/card";
import { Button } from "@/frontend/components/ui/button";
import { Input } from "@/frontend/components/ui/input";
import { Link } from "wouter";

export function TodoApp() {
  const [todos, setTodos] = useState<string[]>([]);
  const [newTodo, setNewTodo] = useState("");

  const addTodo = () => {
    if (newTodo.trim() !== "") {
      setTodos([...todos, newTodo]);
      setNewTodo("");
    }
  };

  const removeTodo = (index: number) => {
    setTodos(todos.filter((_, i) => i !== index));
  };

  return (
    <div className="relative z-10 container mx-auto p-8 text-center">
      <Card>
        <CardHeader className="gap-4">
          <CardTitle className="text-3xl font-bold">Todo App</CardTitle>
          <CardDescription>A simple todo application built with React</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex gap-2">
            <Input
              type="text"
              value={newTodo}
              onChange={(e) => setNewTodo(e.target.value)}
              placeholder="Add a new todo..."
              onKeyPress={(e) => e.key === "Enter" && addTodo()}
              className="flex-1"
            />
            <Button onClick={addTodo}>Add</Button>
          </div>
          <div className="space-y-2">
            {todos.length === 0 ? (
              <p className="text-muted-foreground">No todos yet. Add one above!</p>
            ) : (
              <ul className="space-y-2">
                {todos.map((todo, index) => (
                  <li
                    key={index}
                    className="bg-card flex items-center justify-between rounded border p-2"
                  >
                    <span>{todo}</span>
                    <Button variant="destructive" size="sm" onClick={() => removeTodo(index)}>
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="mt-6">
            <Link href="/" className="text-primary hover:underline">
              Back to Home
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default TodoApp;
