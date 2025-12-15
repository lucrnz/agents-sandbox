import { Link } from "wouter";

export default function NotFound() {
  return (
    <>
      <h1 className="text-4xl font-bold mb-4">Not Found</h1>
      <p className="text-lg mb-4">
        The page you are looking for does not exist.
      </p>
      <Link href="/" className="text-blue-500 hover:underline">
        Navigate to Home Page
      </Link>
    </>
  );
}
