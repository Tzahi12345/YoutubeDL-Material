import { HttpEvent, HttpHandler, HttpInterceptor, HttpRequest } from '@angular/common/http';
import { Injectable, NgZone } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';

@Injectable()
export class H401Interceptor implements HttpInterceptor {

    constructor(private router: Router, private snackBar: MatSnackBar, private ngZone: NgZone) { }

    intercept(request: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
        const zonedResponse$ = new Observable<HttpEvent<any>>(observer => {
            const subscription = next.handle(request).subscribe({
                next: (event) => this.ngZone.run(() => observer.next(event)),
                error: (err) => this.ngZone.run(() => observer.error(err)),
                complete: () => this.ngZone.run(() => observer.complete())
            });

            return () => subscription.unsubscribe();
        });

        return zonedResponse$.pipe(catchError(err => {
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
