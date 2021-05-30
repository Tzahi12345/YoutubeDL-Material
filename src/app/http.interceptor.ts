import { HttpEvent, HttpHandler, HttpInterceptor, HttpRequest } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';

@Injectable()
export class H401Interceptor implements HttpInterceptor {

    constructor(private router: Router, private snackBar: MatSnackBar) { }

    intercept(request: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
        return next.handle(request).pipe(catchError(err => {
            if (err.status === 401) {
                localStorage.setItem('jwt_token', null);
                if (this.router.url !== '/login' && !this.router.url.includes('player')) {
                    this.router.navigate(['/login']).then(() => {
                        this.openSnackBar('Login expired, please login again.');
                    });
                }
            }

            const error = err.error.message || err.statusText;
            return throwError(error);
        }));
    }

    public openSnackBar(message: string, action: string = '') {
        this.snackBar.open(message, action, {
          duration: 2000,
        });
      }
}