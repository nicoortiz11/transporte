package com.transporte.gestion_viaje.model;

import jakarta.persistence.*;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Entity
@Table(name = "clientes")
@Data
public class Cliente {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @NotBlank(message = "El nombre no puede estar vacío") // Seguridad: no guarda si falta el nombre
    private String nombre;

    private String cuit;
    private String tipo;
}