import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { ApplicationRef, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';

let tickQueued = false;

function scheduleUiTick(appRef: ApplicationRef): void {
    if (tickQueued) {
        return;
    }
    tickQueued = true;
    setTimeout(() => {
        tickQueued = false;
        try {
            appRef.tick();
        } catch {
            // Ignore if Angular is mid-navigation or being destroyed.
        }
    });
}

export const h401InterceptorFn: HttpInterceptorFn = (request, next) => {
    const router = inject(Router);
    const snackBar = inject(MatSnackBar);
    const appRef = inject(ApplicationRef);

    return next(request).pipe(
        tap({
            next: () => scheduleUiTick(appRef),
            error: () => scheduleUiTick(appRef),
            complete: () => scheduleUiTick(appRef)
        }),
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
