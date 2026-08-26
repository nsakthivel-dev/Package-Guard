import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";

export default function NotFound() {
  return (
    <div className="p-8 flex items-center justify-center min-h-[50vh]">
      <Card className="w-full max-w-md">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-2">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <h1 className="text-2xl font-bold text-foreground">Page not found</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            This route does not exist. Use the sidebar to navigate.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
