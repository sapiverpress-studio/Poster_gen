import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {bookIdentity,bookAddress,assertPublishedBook,verifiedBookAddress} from '../lib/book-companion-identity.mjs';
const origin='https://books.example.test';
const id=bookIdentity(Buffer.from('manifest'),Buffer.from('interior'));
const html='<html>Book</html>';
const record={...id,status:'published',url:bookAddress(origin,id.bookId),interactiveHash:createHash('sha256').update(html).digest('hex')};
test('same source gives identical identity; another interior or manifest is distinct',()=>{
 assert.deepEqual(bookIdentity(Buffer.from('manifest'),Buffer.from('interior')),id);
 assert.notEqual(bookIdentity(Buffer.from('manifest'),Buffer.from('new interior')).bookId,id.bookId);
 assert.notEqual(bookIdentity(Buffer.from('new manifest'),Buffer.from('interior')).bookId,id.bookId);
 assert.match(id.bookId,/^hb-[0-9a-f]{32}$/);
 assert.throws(()=>bookIdentity(Buffer.alloc(0),Buffer.from('interior')));
});
test('only the configured HTTPS origin and exact published identity can be used',()=>{
 assert.equal(assertPublishedBook(record,id,origin),record.url);
 for(const patch of [{status:'draft'},{manifestHash:'a'.repeat(64)},{interiorHash:'b'.repeat(64)},{url:'https://elsewhere.test/'},{interactiveHash:'invalid'}])assert.throws(()=>assertPublishedBook({...record,...patch},id,origin));
 for(const invalid of ['http://books.example.test','https://user@books.example.test','https://books.example.test/path','https://books.example.test/?q=x'])assert.throws(()=>bookAddress(invalid,id.bookId));
});
test('public receipt and exact served HTML must match before QR approval',async()=>{
 const fetchImpl=async u=>u.endsWith('publication.json')?Response.json(record):new Response(html,{headers:{'content-type':'text/html'}});
 assert.equal(await verifiedBookAddress({identity:id,record,origin,fetchImpl}),record.url);
 await assert.rejects(verifiedBookAddress({identity:id,record,origin,fetchImpl:async()=>new Response('',{status:404})}));
 await assert.rejects(verifiedBookAddress({identity:id,record,origin,fetchImpl:async u=>u.endsWith('publication.json')?Response.json(record):new Response('different',{headers:{'content-type':'text/html'}})}));
});
