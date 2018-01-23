import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';
import {MatNativeDateModule, MatRadioModule, MatInputModule, MatButtonModule, MatSidenavModule, MatIconModule, MatListModule,
  MatSnackBarModule, MatCardModule, MatSelectModule, MatToolbarModule, MatCheckboxModule, MatGridListModule,
  MatProgressBarModule, MatExpansionModule,
  MatGridList} from '@angular/material';
  import {FormsModule, ReactiveFormsModule} from '@angular/forms';
import { AppComponent } from './app.component';
import {BrowserAnimationsModule} from '@angular/platform-browser/animations';
import { HttpModule } from '@angular/http';
import { HttpClientModule, HttpClient } from '@angular/common/http';
import { PostsService } from 'app/posts.services';
import {APP_BASE_HREF} from '@angular/common';
import { FileCardComponent } from './file-card/file-card.component';
import {RouterModule} from '@angular/router';

@NgModule({
  declarations: [
    AppComponent,
    FileCardComponent
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
    MatGridListModule,
    MatExpansionModule,
    MatProgressBarModule,
    RouterModule
  ],
  providers: [PostsService],
  bootstrap: [AppComponent]
})
export class AppModule { }
