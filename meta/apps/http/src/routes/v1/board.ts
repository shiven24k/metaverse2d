import { Router } from "express";
import { userMiddleware } from "../../middleware/user";
import client from "@repo/db/client";
import { getRoomManager } from "../../../../ws/src/getRoomManager";

export const boardRouter = Router();

async function broadcastBoardUpdate(spaceId: string) {
    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (getRoomManager() as any).broadcastToRoom(
            { type: "board-updated", payload: { spaceId } },
            spaceId
        );
    } catch {
        // WS not running in this process (e.g. tests), skip silently
    }
}

// POST /api/v1/board/:boardId/column
boardRouter.post("/:boardId/column", userMiddleware, async (req, res) => {
    const { name, color } = req.body;
    if (!name || typeof name !== "string" || !name.trim()) {
        res.status(400).json({ message: "Column name required" });
        return;
    }

    const board = await client.kanbanBoard.findUnique({
        where: { id: req.params.boardId },
        include: { space: { select: { creatorId: true, id: true } }, columns: { select: { order: true } } },
    });
    if (!board) { res.status(404).json({ message: "Board not found" }); return; }
    if (board.space.creatorId !== req.userId) { res.status(403).json({ message: "Not the space owner" }); return; }

    const maxOrder = board.columns.reduce((m, c) => Math.max(m, c.order), -1);
    const column = await client.kanbanColumn.create({
        data: { boardId: board.id, name: name.trim(), order: maxOrder + 1, color: color ?? "#6366f1" },
    });

    await broadcastBoardUpdate(board.space.id);
    res.json({ column });
});

// PUT /api/v1/board/column/:id
boardRouter.put("/column/:id", userMiddleware, async (req, res) => {
    const { name, order, color } = req.body;

    const column = await client.kanbanColumn.findUnique({
        where: { id: req.params.id },
        include: { board: { include: { space: { select: { creatorId: true, id: true } } } } },
    });
    if (!column) { res.status(404).json({ message: "Column not found" }); return; }
    if (column.board.space.creatorId !== req.userId) { res.status(403).json({ message: "Not the space owner" }); return; }

    const updated = await client.kanbanColumn.update({
        where: { id: req.params.id },
        data: {
            ...(name !== undefined && { name: name.trim() }),
            ...(order !== undefined && { order }),
            ...(color !== undefined && { color }),
        },
    });

    await broadcastBoardUpdate(column.board.space.id);
    res.json({ column: updated });
});

// DELETE /api/v1/board/column/:id
boardRouter.delete("/column/:id", userMiddleware, async (req, res) => {
    const column = await client.kanbanColumn.findUnique({
        where: { id: req.params.id },
        include: { board: { include: { space: { select: { creatorId: true, id: true } } } } },
    });
    if (!column) { res.status(404).json({ message: "Column not found" }); return; }
    if (column.board.space.creatorId !== req.userId) { res.status(403).json({ message: "Not the space owner" }); return; }

    await client.kanbanColumn.delete({ where: { id: req.params.id } });
    await broadcastBoardUpdate(column.board.space.id);
    res.json({ message: "Column deleted" });
});

// POST /api/v1/board/column/:columnId/card
boardRouter.post("/column/:columnId/card", userMiddleware, async (req, res) => {
    const { title } = req.body;
    if (!title || typeof title !== "string" || !title.trim()) {
        res.status(400).json({ message: "Card title required" });
        return;
    }

    const column = await client.kanbanColumn.findUnique({
        where: { id: req.params.columnId },
        include: {
            board: { include: { space: { select: { creatorId: true, id: true } } } },
            cards: { select: { order: true } },
        },
    });
    if (!column) { res.status(404).json({ message: "Column not found" }); return; }

    const maxOrder = column.cards.reduce((m, c) => Math.max(m, c.order), -1);
    const card = await client.kanbanCard.create({
        data: { columnId: column.id, title: title.trim(), order: maxOrder + 1 },
    });

    await broadcastBoardUpdate(column.board.space.id);
    res.json({ card });
});

// PUT /api/v1/board/card/:id
boardRouter.put("/card/:id", userMiddleware, async (req, res) => {
    const { title, description, assigneeId, priority, dueDate } = req.body;

    const card = await client.kanbanCard.findUnique({
        where: { id: req.params.id },
        include: { column: { include: { board: { include: { space: { select: { creatorId: true, id: true } } } } } } },
    });
    if (!card) { res.status(404).json({ message: "Card not found" }); return; }

    const spaceId = card.column.board.space.id;
    const ownerId = card.column.board.space.creatorId;
    const isOwner = ownerId === req.userId;
    const isAssignee = card.assigneeId === req.userId;
    if (!isOwner && !isAssignee) { res.status(403).json({ message: "Not authorized" }); return; }

    const VALID_PRIORITY = new Set(["LOW", "MEDIUM", "HIGH", "URGENT"]);
    const updated = await client.kanbanCard.update({
        where: { id: req.params.id },
        data: {
            ...(title !== undefined && { title: String(title).trim() }),
            ...(description !== undefined && { description: String(description) }),
            ...(assigneeId !== undefined && { assigneeId: assigneeId || null }),
            ...(priority !== undefined && VALID_PRIORITY.has(priority) && { priority }),
            ...(dueDate !== undefined && { dueDate: dueDate ? new Date(dueDate) : null }),
        },
    });

    await broadcastBoardUpdate(spaceId);
    res.json({ card: updated });
});

// PUT /api/v1/board/card/:id/move
boardRouter.put("/card/:id/move", userMiddleware, async (req, res) => {
    const { columnId, order } = req.body;
    if (!columnId || order === undefined) {
        res.status(400).json({ message: "columnId and order required" });
        return;
    }

    const card = await client.kanbanCard.findUnique({
        where: { id: req.params.id },
        include: { column: { include: { board: { include: { space: { select: { id: true } } } } } } },
    });
    if (!card) { res.status(404).json({ message: "Card not found" }); return; }

    const targetColumn = await client.kanbanColumn.findUnique({
        where: { id: columnId },
        select: { boardId: true },
    });
    if (!targetColumn || targetColumn.boardId !== card.column.boardId) {
        res.status(400).json({ message: "Target column not in same board" });
        return;
    }

    const spaceId = card.column.board.space.id;

    await client.$transaction(async (tx) => {
        // Renumber cards in target column to make room
        const siblings = await tx.kanbanCard.findMany({
            where: { columnId, id: { not: card.id } },
            orderBy: { order: "asc" },
        });
        const updates: Promise<unknown>[] = [];
        siblings.forEach((s, i) => {
            const newOrder = i >= order ? i + 1 : i;
            if (s.order !== newOrder) {
                updates.push(tx.kanbanCard.update({ where: { id: s.id }, data: { order: newOrder } }));
            }
        });
        await Promise.all(updates);
        await tx.kanbanCard.update({ where: { id: card.id }, data: { columnId, order } });
    });

    await broadcastBoardUpdate(spaceId);
    res.json({ message: "Card moved" });
});

// DELETE /api/v1/board/card/:id
boardRouter.delete("/card/:id", userMiddleware, async (req, res) => {
    const card = await client.kanbanCard.findUnique({
        where: { id: req.params.id },
        include: { column: { include: { board: { include: { space: { select: { creatorId: true, id: true } } } } } } },
    });
    if (!card) { res.status(404).json({ message: "Card not found" }); return; }
    if (card.column.board.space.creatorId !== req.userId) { res.status(403).json({ message: "Not the space owner" }); return; }

    await client.kanbanCard.delete({ where: { id: card.id } });
    await broadcastBoardUpdate(card.column.board.space.id);
    res.json({ message: "Card deleted" });
});

// POST /api/v1/board/card/:id/comment
boardRouter.post("/card/:id/comment", userMiddleware, async (req, res) => {
    const { content } = req.body;
    if (!content || typeof content !== "string" || !content.trim()) {
        res.status(400).json({ message: "Comment content required" });
        return;
    }

    const card = await client.kanbanCard.findUnique({ where: { id: req.params.id } });
    if (!card) { res.status(404).json({ message: "Card not found" }); return; }

    const comment = await client.kanbanComment.create({
        data: { cardId: card.id, userId: req.userId!, content: content.trim() },
        include: { user: { select: { username: true, name: true } } },
    });

    res.json({
        comment: {
            id: comment.id,
            userId: comment.userId,
            username: comment.user.username ?? comment.user.name,
            content: comment.content,
            createdAt: comment.createdAt,
        },
    });
});

// GET /api/v1/board/card/:id/comments
boardRouter.get("/card/:id/comments", userMiddleware, async (req, res) => {
    const comments = await client.kanbanComment.findMany({
        where: { cardId: req.params.id },
        include: { user: { select: { username: true, name: true } } },
        orderBy: { createdAt: "asc" },
    });

    res.json({
        comments: comments.map((c) => ({
            id: c.id,
            userId: c.userId,
            username: c.user.username ?? c.user.name,
            content: c.content,
            createdAt: c.createdAt,
        })),
    });
});
