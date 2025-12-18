import { Link } from "wouter";

export default function NotFound() {
  return (
    <>
      <h1 className="text-foreground mb-4 text-4xl font-bold">Not Found</h1>
      <p className="text-muted-foreground mb-4 text-lg">
        The page you are looking for does not exist.
      </p>
      <Link href="/" className="text-primary hover:underline">
        Navigate to Home Page
      </Link>
    </>
  );
}
