import { v4 as uuidv4 } from 'uuid';
import { getSQLiteDB } from './sqlite.js';

export interface RAGDocument {
  id: string;
  title: string;
  content: string;
  source_type: string;
  source_path?: string;
  chunk_index: number;
  embedding?: string;
  metadata: string;
  created_at: string;
  updated_at: string;
}

export function getRAGDocuments(sourceType?: string): RAGDocument[] {
  const database = getSQLiteDB();
  if (sourceType) {
    return database.prepare('SELECT * FROM rag_documents WHERE source_type = ? ORDER BY title, chunk_index').all(sourceType) as RAGDocument[];
  }
  return database.prepare('SELECT * FROM rag_documents ORDER BY title, chunk_index').all() as RAGDocument[];
}

export function getRAGDocument(id: string): RAGDocument | undefined {
  const database = getSQLiteDB();
  return database.prepare('SELECT * FROM rag_documents WHERE id = ?').get(id) as RAGDocument | undefined;
}

export function searchRAGDocuments(query: string): RAGDocument[] {
  const database = getSQLiteDB();
  const searchTerm = `%${query}%`;
  return database.prepare('SELECT * FROM rag_documents WHERE title LIKE ? OR content LIKE ? ORDER BY title LIMIT 50').all(searchTerm, searchTerm) as RAGDocument[];
}

export function createRAGDocument(doc: {
  title: string;
  content: string;
  source_type?: string;
  source_path?: string;
  chunk_index?: number;
  embedding?: string;
  metadata?: string;
}): RAGDocument {
  const database = getSQLiteDB();
  const id = uuidv4();
  const sourceType = doc.source_type || 'manual';

  database.prepare(`
    INSERT INTO rag_documents (id, title, content, source_type, source_path, chunk_index, embedding, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    doc.title,
    doc.content,
    sourceType,
    doc.source_path || null,
    doc.chunk_index || 0,
    doc.embedding || null,
    doc.metadata || '{}'
  );

  // Also index into FTS5 for full-text search
  try {
    database.prepare(`
      INSERT INTO rag_documents_fts (doc_id, title, content, source_type)
      VALUES (?, ?, ?, ?)
    `).run(id, doc.title, doc.content, sourceType);
  } catch {
    // FTS indexing failure shouldn't fail document creation
  }

  return getRAGDocument(id)!;
}

export function updateRAGDocumentEmbedding(id: string, embedding: string): void {
  const database = getSQLiteDB();
  database.prepare("UPDATE rag_documents SET embedding = ?, updated_at = datetime('now') WHERE id = ?").run(embedding, id);
}

export function deleteRAGDocument(id: string): boolean {
  const database = getSQLiteDB();

  // Also remove from FTS5 index
  try {
    database.prepare('DELETE FROM rag_documents_fts WHERE doc_id = ?').run(id);
  } catch {
    // FTS deletion failure shouldn't fail document deletion
  }

  const result = database.prepare('DELETE FROM rag_documents WHERE id = ?').run(id);
  return result.changes > 0;
}

export function deleteRAGDocumentsBySource(sourceType: string, sourcePath?: string): number {
  const database = getSQLiteDB();

  // Get IDs to delete from FTS5 first
  const docsToDelete = sourcePath
    ? database.prepare('SELECT id FROM rag_documents WHERE source_type = ? AND source_path = ?').all(sourceType, sourcePath) as Array<{ id: string }>
    : database.prepare('SELECT id FROM rag_documents WHERE source_type = ?').all(sourceType) as Array<{ id: string }>;

  // Remove from FTS5
  try {
    const deleteStmt = database.prepare('DELETE FROM rag_documents_fts WHERE doc_id = ?');
    for (const doc of docsToDelete) {
      deleteStmt.run(doc.id);
    }
  } catch {
    // FTS deletion failure shouldn't fail document deletion
  }

  // Delete from main table
  if (sourcePath) {
    const result = database.prepare('DELETE FROM rag_documents WHERE source_type = ? AND source_path = ?').run(sourceType, sourcePath);
    return result.changes;
  }
  const result = database.prepare('DELETE FROM rag_documents WHERE source_type = ?').run(sourceType);
  return result.changes;
}

export function getRAGDocumentsWithEmbeddings(): RAGDocument[] {
  const database = getSQLiteDB();
  return database.prepare('SELECT * FROM rag_documents WHERE embedding IS NOT NULL').all() as RAGDocument[];
}

// FTS5 Full-Text Search for RAG documents
export interface FTSSearchResult {
  doc_id: string;
  title: string;
  content: string;
  source_type: string;
  rank: number;
  snippet: string;
}

export function searchRAGDocumentsFTS(query: string, limit: number = 20): FTSSearchResult[] {
  const database = getSQLiteDB();
  try {
    // Use FTS5 MATCH query with BM25 ranking
    // Join with rag_documents table to get actual content (FTS table is contentless)
    const results = database.prepare(`
      SELECT
        fts.doc_id,
        docs.title,
        docs.content,
        docs.source_type,
        bm25(rag_documents_fts) as rank,
        snippet(rag_documents_fts, 2, '<mark>', '</mark>', '...', 50) as snippet
      FROM rag_documents_fts fts
      JOIN rag_documents docs ON fts.doc_id = docs.id
      WHERE rag_documents_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `).all(query, limit) as FTSSearchResult[];
    return results;
  } catch (error) {
    // Fallback to empty results if FTS fails (e.g., invalid query syntax)
    console.error('FTS search error:', error);
    return [];
  }
}

export function indexRAGDocumentFTS(docId: string, title: string, content: string, sourceType: string): void {
  const database = getSQLiteDB();
  try {
    database.prepare(`
      INSERT INTO rag_documents_fts (doc_id, title, content, source_type)
      VALUES (?, ?, ?, ?)
    `).run(docId, title, content, sourceType);
  } catch (error) {
    console.error('FTS index error:', error);
  }
}

export function removeRAGDocumentFTS(docId: string): void {
  const database = getSQLiteDB();
  try {
    database.prepare(`
      DELETE FROM rag_documents_fts WHERE doc_id = ?
    `).run(docId);
  } catch (error) {
    console.error('FTS remove error:', error);
  }
}

export function rebuildFTSIndex(): number {
  const database = getSQLiteDB();
  // Clear existing FTS index
  database.prepare('DELETE FROM rag_documents_fts').run();

  // Re-index all documents
  const docs = database.prepare('SELECT id, title, content, source_type FROM rag_documents').all() as Array<{
    id: string;
    title: string;
    content: string;
    source_type: string;
  }>;

  const insertStmt = database.prepare(`
    INSERT INTO rag_documents_fts (doc_id, title, content, source_type)
    VALUES (?, ?, ?, ?)
  `);

  for (const doc of docs) {
    insertStmt.run(doc.id, doc.title, doc.content, doc.source_type);
  }

  return docs.length;
}
