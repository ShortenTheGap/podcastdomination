"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Send,
  Edit,
  Trash2,
  Check,
  X,
  Sparkles,
  Mail,
  Clock,
} from "lucide-react";
import type { OutreachWithRelations } from "@/types";

export default function DraftsPage() {
  const [selectedDraft, setSelectedDraft] = useState<OutreachWithRelations | null>(null);
  const [editedSubject, setEditedSubject] = useState("");
  const [editedBody, setEditedBody] = useState("");
  const queryClient = useQueryClient();

  const { data: drafts, isLoading } = useQuery<OutreachWithRelations[]>({
    queryKey: ["drafts"],
    queryFn: async () => {
      const res = await fetch("/api/draft?status=drafted,review");
      if (!res.ok) throw new Error("Failed to fetch drafts");
      return res.json();
    },
  });

  const updateDraft = useMutation({
    mutationFn: async (data: { outreachId: string; subject?: string; body?: string; status?: string }) => {
      const res = await fetch("/api/draft", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update draft");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["drafts"] });
      setSelectedDraft(null);
    },
  });

  const sendEmail = useMutation({
    mutationFn: async (outreachId: string) => {
      const res = await fetch("/api/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outreachId }),
      });
      if (!res.ok) throw new Error("Failed to send email");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["drafts"] });
      queryClient.invalidateQueries({ queryKey: ["pipeline"] });
    },
  });

  const openEditor = (draft: OutreachWithRelations) => {
    setSelectedDraft(draft);
    setEditedSubject(draft.subject || "");
    setEditedBody(draft.body || "");
  };

  const handleSave = () => {
    if (selectedDraft) {
      updateDraft.mutate({
        outreachId: selectedDraft.id,
        subject: editedSubject,
        body: editedBody,
      });
    }
  };

  const handleApprove = (draft: OutreachWithRelations) => {
    updateDraft.mutate({
      outreachId: draft.id,
      status: "review",
    });
  };

  const handleSend = (draft: OutreachWithRelations) => {
    if (confirm("Are you sure you want to send this email?")) {
      sendEmail.mutate(draft.id);
    }
  };

  const draftedEmails = drafts?.filter((d) => d.status === "drafted") || [];
  const reviewEmails = drafts?.filter((d) => d.status === "review") || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Email Drafts</h1>
        <p className="text-sm text-gray-500">
          Review and edit AI-generated email drafts before sending
        </p>
      </div>

      <Tabs defaultValue="drafts">
        <TabsList>
          <TabsTrigger value="drafts">
            Drafts
            <Badge variant="secondary" className="ml-2">
              {draftedEmails.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="review">
            Ready to Send
            <Badge variant="secondary" className="ml-2">
              {reviewEmails.length}
            </Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="drafts" className="mt-6">
          <div className="grid gap-4">
            {isLoading ? (
              <div className="text-center py-8 text-gray-500">Loading...</div>
            ) : draftedEmails.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Sparkles className="h-12 w-12 mx-auto text-gray-300 mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    No drafts yet
                  </h3>
                  <p className="text-gray-500">
                    Generate email drafts from the Pipeline page
                  </p>
                </CardContent>
              </Card>
            ) : (
              draftedEmails.map((draft) => (
                <DraftCard
                  key={draft.id}
                  draft={draft}
                  onEdit={() => openEditor(draft)}
                  onApprove={() => handleApprove(draft)}
                />
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="review" className="mt-6">
          <div className="grid gap-4">
            {reviewEmails.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Mail className="h-12 w-12 mx-auto text-gray-300 mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    No emails ready to send
                  </h3>
                  <p className="text-gray-500">
                    Approve drafts to move them here
                  </p>
                </CardContent>
              </Card>
            ) : (
              reviewEmails.map((draft) => (
                <DraftCard
                  key={draft.id}
                  draft={draft}
                  onEdit={() => openEditor(draft)}
                  onSend={() => handleSend(draft)}
                  showSend
                />
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Edit Dialog */}
      <Dialog open={!!selectedDraft} onOpenChange={() => setSelectedDraft(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Draft</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700">
                To: {selectedDraft?.contact?.email || "No contact"}
              </label>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700">Subject</label>
              <Input
                value={editedSubject}
                onChange={(e) => setEditedSubject(e.target.value)}
                className="mt-1"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700">Body</label>
              <textarea
                value={editedBody}
                onChange={(e) => setEditedBody(e.target.value)}
                className="mt-1 w-full h-64 rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-950"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedDraft(null)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={updateDraft.isPending}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DraftCard({
  draft,
  onEdit,
  onApprove,
  onSend,
  showSend = false,
}: {
  draft: OutreachWithRelations;
  onEdit: () => void;
  onApprove?: () => void;
  onSend?: () => void;
  showSend?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-base">{draft.podcast.name}</CardTitle>
            <p className="text-sm text-gray-500 mt-1">
              To: {draft.contact?.email || "No contact"}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onEdit}>
              <Edit className="h-3 w-3 mr-1" />
              Edit
            </Button>
            {showSend ? (
              <Button size="sm" onClick={onSend}>
                <Send className="h-3 w-3 mr-1" />
                Send
              </Button>
            ) : (
              <Button size="sm" onClick={onApprove}>
                <Check className="h-3 w-3 mr-1" />
                Approve
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="bg-gray-50 rounded-lg p-4">
          <p className="text-sm font-medium text-gray-900 mb-2">
            {draft.subject}
          </p>
          <p className="text-sm text-gray-600 whitespace-pre-wrap line-clamp-4">
            {draft.body}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
