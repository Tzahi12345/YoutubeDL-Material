import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject, NgZone } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';

function runInAngularZone<T>(source$: Observable<T>, ngZone: NgZone): Observable<T> {
    return new Observable<T>((subscriber) => {
        const subscription = source$.subscribe({
            next: (value) => ngZone.run(() => subscriber.next(value)),
            error: (error) => ngZone.run(() => subscriber.error(error)),
            complete: () => ngZone.run(() => subscriber.complete())
        });

        return () => subscription.unsubscribe();
    });
}

export const h401InterceptorFn: HttpInterceptorFn = (request, next) => {
    const router = inject(Router);
    const snackBar = inject(MatSnackBar);
    const ngZone = inject(NgZone);

    return runInAngularZone(next(request), ngZone).pipe(
        catchError((err: HttpErrorResponse) => {
            if (err.status === 401) {
                localStorage.setItem('jwt_token', null);
                if (router.url !== '/login' && !router.url.includes('player')) {
                    router.navigate(['/login']).then(() => {
                        snackBar.open('Login expired, please login again.', '', { duration: 2000 });
                    });
                }
            }

            const error = err?.error?.message || err?.statusText || 'Request failed';
            return throwError(error);
        })
    );
};
