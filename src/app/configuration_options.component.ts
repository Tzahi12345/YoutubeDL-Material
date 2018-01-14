import { ConfigureOptions } from 'ng4-configure/ng4-configure';
 
   export class MyOptions extends ConfigureOptions {
     ConfigurationURL: string = 'assets/config.json';
     AppVersion: string = '0.0.0';
     BustCache: boolean = false
   }