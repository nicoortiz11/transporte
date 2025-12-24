package com.transporte.gestion_viaje;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class GestionViajeApplication {

    public static void main(String[] args) {
        SpringApplication.run(GestionViajeApplication.class, args);
    }

    // El bloque "initDatabase" ya no es necesario, lo borramos.
}