import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map, mergeMap } from 'rxjs/operators';
import deepResolvePromises from './deep-resolver';

@Injectable()
export class ResolvePromisesInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(mergeMap((data) => deepResolvePromises(data)));
  }
}

/**
 * Converts any Mongoose document (or array/nested object containing documents)
 * to plain JS objects before class-transformer serialisation runs.
 * This prevents "TypeError: callback is not a function" from Mongoose's
 * internal stateMachine when ClassSerializerInterceptor tries to iterate it.
 */
function toPlain(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  // Mongoose document — has toObject()
  if (typeof (value as any)?.toObject === 'function') {
    return toPlain((value as any).toObject());
  }
  if (Array.isArray(value)) {
    return value.map(toPlain);
  }
  if (typeof value === 'object') {
    const plain: Record<string, unknown> = {};
    for (const key of Object.keys(value as object)) {
      plain[key] = toPlain((value as any)[key]);
    }
    return plain;
  }
  return value;
}

@Injectable()
export class MongoosePlainInterceptor implements NestInterceptor {
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    return next.handle().pipe(map((data) => toPlain(data)));
  }
}
