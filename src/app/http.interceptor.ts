import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { diagEvent, diagHttpCallback } from './diagnostics';

export const h401InterceptorFn: HttpInterceptorFn = (request, next) => {
    const router = inject(Router);
    const snackBar = inject(MatSnackBar);

    return next(request).pipe(
        tap({
            next: () => diagHttpCallback('next', request.method, request.urlWithParams),
            error: () => diagHttpCallback('error', request.method, request.urlWithParams),
            complete: () => diagHttpCallback('complete', request.method, request.urlWithParams)
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

            diagEvent('http.401Interceptor.catchError', {
                method: request.method,
                url: request.urlWithParams,
                status: err.status
            });

            const error = err?.error?.message || err?.statusText || 'Request failed';
            return throwError(error);
        })
    );
};
