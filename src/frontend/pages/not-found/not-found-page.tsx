import { Link } from "wouter";

export default function NotFound() {
  return (
    <>
      <h1 className="text-4xl font-bold mb-4 text-foreground">Not Found</h1>
      <p className="text-lg mb-4 text-muted-foreground">
        The page you are looking for does not exist.
      </p>
      <Link href="/" className="text-primary hover:underline">
        Navigate to Home Page
      </Link>
    </>
  );
}
