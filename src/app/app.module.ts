import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';
import {MatNativeDateModule, MatRadioModule, MatInputModule, MatButtonModule, MatSidenavModule, MatIconModule, MatListModule,
  MatSnackBarModule, MatCardModule, MatSelectModule, MatToolbarModule, MatCheckboxModule,
  MatProgressBarModule  } from '@angular/material';
  import {FormsModule, ReactiveFormsModule} from '@angular/forms';
import { AppComponent } from './app.component';
import {BrowserAnimationsModule} from '@angular/platform-browser/animations';
import { HttpModule } from '@angular/http';
import { HttpClientModule } from '@angular/common/http';
import { PostsService } from 'app/posts.services';

@NgModule({
  declarations: [
    AppComponent
  ],
  imports: [
    BrowserModule,
    BrowserAnimationsModule,
    MatNativeDateModule,
    MatRadioModule,
    FormsModule,
    MatInputModule,
    MatSelectModule,
    ReactiveFormsModule,
    HttpModule,
    HttpClientModule,
    MatToolbarModule,
    MatCardModule,
    MatSnackBarModule,
    MatButtonModule,
    MatCheckboxModule,
    MatSidenavModule,
    MatIconModule,
    MatListModule,
    MatProgressBarModule
  ],
  providers: [PostsService],
  bootstrap: [AppComponent]
})
export class AppModule { }
